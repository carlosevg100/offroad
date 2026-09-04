-- The professional context becomes multi-valued and strictly personal.
--
-- The previous shape accepted one affiliation and one role, which does not describe how people
-- work: someone can be a banker and an advisor, cover DCM and corporate banking, and use the
-- product both inside an institution and on their own. It also mixed two different kinds of
-- fact in one row. What a person does is self-knowledge and costs nothing to accept; what an
-- institution can do is a capability that carries consequence in matching and in what the
-- product may claim, so it lives in institution_capability_profiles, where it already keeps
-- origin, owner, confirmation date and disclosure status.
--
-- The personal profile therefore keeps only what the person can answer about themselves and
-- drops the capability columns it was never entitled to hold. Both tables are empty, so this
-- is a definition change, not a data migration.

alter table public.professional_context_profiles
  add column if not exists use_forms text[] not null default '{}',
  add column if not exists professional_roles text[] not null default '{}',
  add column if not exists practice_areas text[] not null default '{}';

alter table public.professional_context_profiles
  drop constraint if exists professional_context_use_forms_valid,
  drop constraint if exists professional_context_roles_valid,
  drop constraint if exists professional_context_practice_areas_valid,
  drop constraint if exists professional_context_objectives_valid;

alter table public.professional_context_profiles
  add constraint professional_context_use_forms_valid check (
    use_forms <@ array[
      'institutional_work', 'independent_practice', 'personal_projects', 'exploring'
    ]::text[] and cardinality(use_forms) <= 4
  ),
  add constraint professional_context_roles_valid check (
    professional_roles <@ array[
      'ceo_founder', 'board_shareholder', 'cfo', 'treasury', 'corporate_finance',
      'banker', 'financial_advisor', 'originator', 'credit_analyst', 'risk_underwriting',
      'investor_portfolio_manager', 'legal_operations', 'independent_consultant',
      'student_researcher', 'other'
    ]::text[] and cardinality(professional_roles) <= 15
  ),
  add constraint professional_context_practice_areas_valid check (
    practice_areas <@ array[
      'treasury', 'corporate_finance', 'fp_and_a', 'strategy', 'corporate_development',
      'investor_relations', 'dcm', 'investment_banking', 'corporate_banking',
      'structured_finance', 'project_finance', 'origination', 'syndicate_distribution',
      'credit', 'underwriting', 'risk', 'private_credit', 'investments',
      'portfolio_management', 'special_situations', 'legal', 'operations', 'other'
    ]::text[] and cardinality(practice_areas) <= 23
  ),
  add constraint professional_context_objectives_valid check (
    primary_objectives <@ array[
      'understand_company', 'understand_capital_structure', 'evaluate_capital_options',
      'prepare_meetings', 'originate_ideas', 'organize_documents', 'analyze_investments',
      'structure_transactions', 'prepare_materials', 'connect_capital', 'monitor_positions',
      'explore_platform', 'other'
    ]::text[] and cardinality(primary_objectives) <= 13
  );

-- Capability columns leave the personal profile. Keeping them here let a single person's answer
-- read as an institutional fact, which is the one thing the profile must never become.
alter table public.professional_context_profiles
  drop column if exists affiliation_kind,
  drop column if exists professional_role,
  drop column if exists team_name,
  drop column if exists operating_models,
  drop column if exists product_families,
  drop column if exists context_notes;

comment on table public.professional_context_profiles is
  'Personal professional context: how someone uses Offroad, the roles they hold, the areas they '
  'work in and what they want help with. Guidance for posture and deliverable only. It never '
  'narrows the economic universe, never authorizes access, never proves an institutional '
  'capability and is not a mandate. Capabilities live in institution_capability_profiles.';

comment on column public.professional_context_profiles.institution_name is
  'Organization the person declared they work at. A stated affiliation, not verified employment '
  'and not permission to speak for that organization.';

-- Both agent context loaders publish the new shape. The personal block no longer carries
-- capability fields, so nothing downstream can read a person's self-description as proof of
-- what their institution is able to do. The rest of each function is reproduced unchanged.

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
    )
  );
end;
$$;

-- The save path takes only what the screen asks and only what a person can answer about
-- themselves. The institution row receives the declared name so the organization has one, and
-- nothing else: operating models and product families are capabilities and are confirmed
-- elsewhere, by someone who can manage the organization, with an origin recorded.
create or replace function public.save_professional_capability_context_v2(
  p_organization_id uuid,
  p_use_forms text[] default '{}',
  p_professional_roles text[] default '{}',
  p_practice_areas text[] default '{}',
  p_primary_objectives text[] default '{}',
  p_institution_name text default null,
  p_skip boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  computed_status text;
  normalized_institution text := nullif(trim(p_institution_name), '');
  normalized_use_forms text[] := coalesce(p_use_forms, '{}');
  normalized_roles text[] := coalesce(p_professional_roles, '{}');
  normalized_areas text[] := coalesce(p_practice_areas, '{}');
  normalized_objectives text[] := coalesce(p_primary_objectives, '{}');
begin
  if actor_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not (select private.is_org_member(p_organization_id)) then
    raise exception 'organization_access_denied' using errcode = '42501';
  end if;

  if not normalized_use_forms <@ array[
    'institutional_work', 'independent_practice', 'personal_projects', 'exploring'
  ]::text[] or cardinality(normalized_use_forms) > 4 then
    raise exception 'invalid_use_forms' using errcode = '22023';
  end if;
  if not normalized_roles <@ array[
    'ceo_founder', 'board_shareholder', 'cfo', 'treasury', 'corporate_finance',
    'banker', 'financial_advisor', 'originator', 'credit_analyst', 'risk_underwriting',
    'investor_portfolio_manager', 'legal_operations', 'independent_consultant',
    'student_researcher', 'other'
  ]::text[] or cardinality(normalized_roles) > 15 then
    raise exception 'invalid_professional_roles' using errcode = '22023';
  end if;
  if not normalized_areas <@ array[
    'treasury', 'corporate_finance', 'fp_and_a', 'strategy', 'corporate_development',
    'investor_relations', 'dcm', 'investment_banking', 'corporate_banking',
    'structured_finance', 'project_finance', 'origination', 'syndicate_distribution',
    'credit', 'underwriting', 'risk', 'private_credit', 'investments',
    'portfolio_management', 'special_situations', 'legal', 'operations', 'other'
  ]::text[] or cardinality(normalized_areas) > 23 then
    raise exception 'invalid_practice_areas' using errcode = '22023';
  end if;
  if not normalized_objectives <@ array[
    'understand_company', 'understand_capital_structure', 'evaluate_capital_options',
    'prepare_meetings', 'originate_ideas', 'organize_documents', 'analyze_investments',
    'structure_transactions', 'prepare_materials', 'connect_capital', 'monitor_positions',
    'explore_platform', 'other'
  ]::text[] or cardinality(normalized_objectives) > 13 then
    raise exception 'invalid_primary_objectives' using errcode = '22023';
  end if;

  -- An organization name only means something for someone who says they work at one. Recording
  -- it for a person who told us the opposite would invent an affiliation they did not declare.
  if not ('institutional_work' = any (normalized_use_forms)) then
    normalized_institution := null;
  end if;

  if p_skip then
    computed_status := 'skipped';
    normalized_use_forms := '{}';
    normalized_roles := '{}';
    normalized_areas := '{}';
    normalized_objectives := '{}';
    normalized_institution := null;
  elsif cardinality(normalized_use_forms) > 0
    and cardinality(normalized_roles) > 0
    and cardinality(normalized_objectives) > 0 then
    computed_status := 'complete';
  elsif cardinality(normalized_use_forms) > 0
    or cardinality(normalized_roles) > 0
    or cardinality(normalized_areas) > 0
    or cardinality(normalized_objectives) > 0
    or normalized_institution is not null then
    computed_status := 'partial';
  else
    computed_status := 'skipped';
  end if;

  insert into public.professional_context_profiles (
    organization_id, user_id, use_forms, professional_roles, practice_areas,
    primary_objectives, institution_name, disclosure_status, last_confirmed_at
  ) values (
    p_organization_id, actor_id, normalized_use_forms, normalized_roles, normalized_areas,
    normalized_objectives, normalized_institution, computed_status,
    case when computed_status = 'complete' then now() else null end
  )
  on conflict (organization_id, user_id) do update set
    use_forms = excluded.use_forms,
    professional_roles = excluded.professional_roles,
    practice_areas = excluded.practice_areas,
    primary_objectives = excluded.primary_objectives,
    institution_name = excluded.institution_name,
    disclosure_status = excluded.disclosure_status,
    last_confirmed_at = excluded.last_confirmed_at;

  if normalized_institution is not null and (select private.can_manage_organization(p_organization_id)) then
    insert into public.institution_capability_profiles (
      organization_id, institution_name, source_kind, disclosure_status, updated_by
    ) values (
      p_organization_id, normalized_institution, 'self_declared', 'partial', actor_id
    )
    on conflict (organization_id) do update set
      institution_name = excluded.institution_name,
      updated_by = excluded.updated_by;
  end if;

  update public.onboarding_progress
  set answers = coalesce(answers, '{}'::jsonb) || jsonb_build_object(
    'professional_context', jsonb_build_object('status', computed_status, 'updated_at', now())
  )
  where organization_id = p_organization_id and user_id = actor_id;

  return jsonb_build_object(
    'status', computed_status,
    'use_forms', to_jsonb(normalized_use_forms),
    'professional_roles', to_jsonb(normalized_roles),
    'practice_areas', to_jsonb(normalized_areas),
    'primary_objectives', to_jsonb(normalized_objectives),
    'institution_name', normalized_institution
  );
end;
$$;

revoke all on function public.save_professional_capability_context_v2(
  uuid, text[], text[], text[], text[], text, boolean
) from public, anon;
grant execute on function public.save_professional_capability_context_v2(
  uuid, text[], text[], text[], text[], text, boolean
) to authenticated;

comment on function public.save_professional_capability_context_v2(
  uuid, text[], text[], text[], text[], text, boolean
) is
  'Saves the personal professional context. Accepts several use forms, roles and practice areas '
  'because people hold several at once. Writes no institutional capability: only the declared '
  'organization name, and only when the caller says they work at one.';

-- The single-value entry points cannot survive the columns they wrote to.
drop function if exists public.save_professional_capability_context_v1(
  uuid, text, text, text, text[], text, text[], text[], text, boolean
);
drop function if exists public.save_professional_capability_context_before_personal_institutio(
  uuid, text, text, text, text[], text, text[], text[], text, boolean
);
