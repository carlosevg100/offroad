-- Resolve a repeated human-readable project title inside the creation transaction. The browser
-- should never pay for an expected unique-violation round trip before entering the workspace.

create or replace function public.start_advisor_project_v1(
  p_request_id uuid,
  p_locale text,
  p_project_name text,
  p_entry_job text,
  p_prompt text,
  p_access_basis text,
  p_plan jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  target_organization_id uuid;
  normalized_name text := trim(regexp_replace(coalesce(p_project_name, ''), '\s+', ' ', 'g'));
  available_name text := normalized_name;
begin
  select organization.id into target_organization_id
  from public.organizations organization
  join public.organization_memberships membership
    on membership.organization_id = organization.id
  where membership.user_id = caller_id
    and membership.status = 'active'
    and organization.organization_type in ('company', 'originator')
  order by membership.created_at asc
  limit 1;

  if target_organization_id is not null and exists (
    select 1
    from public.capital_projects project
    where project.organization_id = target_organization_id
      and lower(project.project_name) = lower(normalized_name)
      and project.status <> 'archived'
  ) then
    available_name := left(normalized_name, 71) || ' · ' || left(p_request_id::text, 6);
  end if;

  return private.start_advisor_project_v1(
    p_request_id,
    p_locale,
    available_name,
    p_entry_job,
    p_prompt,
    p_access_basis,
    p_plan
  );
end;
$$;

comment on function public.start_advisor_project_v1(uuid, text, text, text, text, text, jsonb) is
  'Creates one advisor project stack and resolves repeated project titles within the same database transaction.';
