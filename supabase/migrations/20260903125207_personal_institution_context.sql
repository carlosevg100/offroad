-- Preserve the institution named by every user even when they cannot edit the
-- organization-wide capability profile.

alter table public.professional_context_profiles
  add column if not exists institution_name text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'professional_context_institution_name_length'
      and conrelid = 'public.professional_context_profiles'::regclass
  ) then
    alter table public.professional_context_profiles
      add constraint professional_context_institution_name_length
      check (institution_name is null or char_length(institution_name) <= 200);
  end if;
end;
$$;

alter function public.save_professional_capability_context_v1(
  uuid, text, text, text, text[], text, text[], text[], text, boolean
) rename to save_professional_capability_context_before_personal_institution_v1;

create function public.save_professional_capability_context_v1(
  p_organization_id uuid,
  p_affiliation_kind text default null,
  p_professional_role text default null,
  p_team_name text default null,
  p_primary_objectives text[] default '{}',
  p_institution_name text default null,
  p_operating_models text[] default '{}',
  p_product_families text[] default '{}',
  p_capability_notes text default null,
  p_skip boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  normalized_institution text := nullif(trim(p_institution_name), '');
begin
  result := public.save_professional_capability_context_before_personal_institution_v1(
    p_organization_id,
    p_affiliation_kind,
    p_professional_role,
    p_team_name,
    p_primary_objectives,
    p_institution_name,
    p_operating_models,
    p_product_families,
    p_capability_notes,
    p_skip
  );

  update public.professional_context_profiles
  set institution_name = case when p_skip then null else normalized_institution end
  where organization_id = p_organization_id
    and user_id = (select auth.uid());

  return result || jsonb_build_object(
    'institution_name', case when p_skip then null else normalized_institution end
  );
end;
$$;

revoke all on function public.save_professional_capability_context_v1(
  uuid, text, text, text, text[], text, text[], text[], text, boolean
) from public, anon;
grant execute on function public.save_professional_capability_context_v1(
  uuid, text, text, text, text[], text, text[], text[], text, boolean
) to authenticated;

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
  base_context jsonb := private.worker_load_agent_context_before_professional_context_v1(p_job_id, p_capability_token);
  job_row public.processing_jobs := private.job_for_capability(p_job_id, p_capability_token);
  message_actor uuid;
begin
  select message.created_by into message_actor
  from public.agent_messages message
  where message.organization_id = job_row.organization_id
    and message.id = (base_context ->> 'message_id')::uuid;

  return base_context || jsonb_build_object(
    'professional_context', (
      select jsonb_build_object(
        'affiliationKind', profile.affiliation_kind,
        'professionalRole', profile.professional_role,
        'teamName', profile.team_name,
        'institutionName', profile.institution_name,
        'operatingModels', to_jsonb(profile.operating_models),
        'productFamilies', to_jsonb(profile.product_families),
        'primaryObjectives', to_jsonb(profile.primary_objectives),
        'contextNotes', profile.context_notes,
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

revoke all on function private.worker_load_agent_context(uuid, text) from public, anon;
grant execute on function private.worker_load_agent_context(uuid, text) to authenticated;

comment on function public.worker_load_agent_context(uuid, text) is
  'Loads a capability-scoped advisor turn with project memory and optional user/institution execution context; never cross-tenant context.';
