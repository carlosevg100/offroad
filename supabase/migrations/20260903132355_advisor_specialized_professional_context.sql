-- The conversational router already knows the user's professional context, but the specialized
-- analytical executor did not. Enrich the capability-bound project context so alternatives can be
-- prioritized and explained for the user without treating the institution's capabilities as the
-- boundary of what may be best for the company.

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

create or replace function public.worker_load_capital_project_context_v4(
  p_job_id uuid,
  p_capability_token text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.worker_load_capital_project_context_v4(p_job_id, p_capability_token);
$$;

revoke all on function private.worker_load_capital_project_context_v4(uuid, text)
  from public, anon, authenticated;
revoke all on function public.worker_load_capital_project_context_v4(uuid, text)
  from public, anon;
grant execute on function private.worker_load_capital_project_context_v4(uuid, text)
  to authenticated;
grant execute on function public.worker_load_capital_project_context_v4(uuid, text)
  to authenticated;

comment on function public.worker_load_capital_project_context_v4(uuid, text) is
  'Loads one capability-bound project plus the initiating user professional context and same-organization institution profile. The context personalizes execution but never constrains the company alternative universe.';
